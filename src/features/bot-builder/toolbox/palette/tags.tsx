import React from 'react';

const Arg = ({ ...props }) => {
    return React.createElement('arg', props);
};

const Block = ({ ...props }) => {
    return React.createElement('block', props);
};

const Category = ({ ...props }) => {
    return React.createElement('category', props);
};

const Example = ({ ...props }) => {
    return React.createElement('example', props);
};

const Examples = ({ ...props }) => {
    return React.createElement('examples', props);
};

const Field = ({ ...props }) => {
    return React.createElement('field', props);
};

const Mutation = ({ ...props }) => {
    return React.createElement('mutation', props);
};

const Next = ({ ...props }) => {
    return React.createElement('next', props);
};

const Shadow = ({ ...props }) => {
    return React.createElement('shadow', props);
};

const Statement = ({ ...props }) => {
    return React.createElement('statement', props);
};

const Value = ({ ...props }) => {
    return React.createElement('value', props);
};

const Xml = ({ ...props }) => {
    return React.createElement('xml', props);
};

export { Arg, Block, Category, Example, Examples, Field, Mutation, Next, Shadow, Statement, Value, Xml };
